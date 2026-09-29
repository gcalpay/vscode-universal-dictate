#!/usr/bin/env python3
"""M3.1 diagnostic only: complete PCM snapshots -> local pinned whisper-server.

No microphone, clipboard, insertion, model download, or extension activation.
Python is a developer/runner tool, not a new extension dependency. Reports omit
transcript text. This is not a live-recorder or native-overlay acceptance test.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import platform
import random
import socket
import statistics
import struct
import subprocess
import tempfile
import threading
import time
import uuid
import wave
from typing import Callable

RATE = 16_000
BYTES_PER_FRAME = 2
MODEL_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
MAX_FIXTURE_BYTES = RATE * BYTES_PER_FRAME * 300  # Diagnostic bound, not product recording limit.
MAX_RESPONSE_BYTES = 1024 * 1024


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read_pcm(path: Path) -> bytes:
    """Require a closed, well-framed RIFF PCM16/mono/16 kHz fixture.

    Never interpret a live encoder's unfinished data length as complete audio.
    Unknown, correctly framed RIFF chunks are allowed (e.g. SAPI metadata).
    """
    if path.stat().st_size > MAX_FIXTURE_BYTES + 1024 * 1024:
        raise ValueError('fixture exceeds diagnostic size bound')
    raw = path.read_bytes()
    if len(raw) < 12 or raw[:4] != b'RIFF' or raw[8:12] != b'WAVE':
        raise ValueError('fixture must be a closed RIFF/WAVE file')
    if struct.unpack_from('<I', raw, 4)[0] + 8 != len(raw):
        raise ValueError('RIFF length mismatch: truncated, trailing, or unfinished WAV')
    pos, fmt, pcm = 12, None, None
    while pos < len(raw):
        if pos + 8 > len(raw):
            raise ValueError('truncated chunk header')
        kind, size = struct.unpack_from('<4sI', raw, pos)
        begin, end = pos + 8, pos + 8 + size
        if end > len(raw):
            raise ValueError('truncated chunk payload')
        if kind == b'fmt ':
            if fmt is not None or size < 16:
                raise ValueError('invalid or duplicate fmt chunk')
            fmt = struct.unpack_from('<HHIIHH', raw, begin)
        elif kind == b'data':
            if pcm is not None:
                raise ValueError('duplicate data chunk')
            pcm = raw[begin:end]
        pos = end + (size & 1)
    if pos != len(raw) or fmt != (1, 1, RATE, RATE * 2, 2, 16):
        raise ValueError('expected PCM16 mono 16000 Hz with valid chunk padding')
    if not pcm or len(pcm) % 2 or len(pcm) > MAX_FIXTURE_BYTES:
        raise ValueError('empty, unaligned, or oversized PCM')
    return pcm


def make_wav(pcm: bytes) -> bytes:
    if not pcm or len(pcm) % 2 or len(pcm) > MAX_FIXTURE_BYTES:
        raise ValueError('invalid PCM snapshot length')
    result = io.BytesIO()
    with wave.open(result, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm)
    return result.getvalue()


def snapshot(pcm: bytes, end_s: float, width_s: float | None) -> tuple[bytes, float, float]:
    if not math.isfinite(end_s) or end_s <= 0:
        raise ValueError('snapshot end must be finite and positive')
    if width_s is not None and (not math.isfinite(width_s) or width_s <= 0):
        raise ValueError('snapshot window must be finite and positive')
    if len(pcm) % 2:
        raise ValueError('unaligned source PCM')
    end = min(len(pcm) // 2, int(end_s * RATE))
    start = 0 if width_s is None else max(0, end - int(width_s * RATE))
    return make_wav(pcm[start * 2:end * 2]), start / RATE, end / RATE


def multipart(wav: bytes, language: str) -> tuple[str, bytes]:
    # Same inference fields as the reviewed production buildMultipartBody.
    if language not in ('en', 'de', 'auto'):
        raise ValueError('benchmark languages are en, de, auto')
    boundary = '----UniversalDictateBenchmark' + uuid.uuid4().hex
    fields = [('language', language), ('response_format', 'text'), ('no_timestamps', 'true')]
    data = []
    for name, value in fields:
        data.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    data.extend([
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="snapshot.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(),
        wav, f'\r\n--{boundary}--\r\n'.encode(),
    ])
    return boundary, b''.join(data)


class LocalRequest:
    def __init__(self, port: int, route: str, wav: bytes, language: str, timeout: float = 120):
        if not route.startswith('/') or '\r' in route or '\n' in route:
            raise ValueError('invalid local route')
        self.port, self.route = port, route
        self.boundary, self.body = multipart(wav, language)
        self.timeout = timeout
        self.sent = threading.Event()
        self.connection: http.client.HTTPConnection | None = None
        self.socket: socket.socket | None = None
        self.cancelled = False

    def run(self) -> dict:
        begin = time.perf_counter()
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=self.timeout)
        self.connection = connection
        try:
            connection.request('POST', self.route + '/inference', self.body, {
                'Content-Type': f'multipart/form-data; boundary={self.boundary}',
                'Content-Length': str(len(self.body)), 'Connection': 'close',
            })
            self.socket = connection.sock
            self.sent.set()
            response = connection.getresponse()
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError('inference response exceeds diagnostic bound')
            if response.status != 200:
                raise RuntimeError(f'local inference returned HTTP {response.status}')
            text = ' '.join(raw.decode('utf-8').split())
            return {'elapsed_ms': (time.perf_counter() - begin) * 1000,
                    'nonempty': bool(text), 'characters': len(text),
                    'text_sha256': hashlib.sha256(text.encode()).hexdigest()}
        finally:
            self.sent.set()  # Also unblock a probe after a connection error.
            connection.close()

    def abort(self) -> None:
        self.cancelled = True
        sock = self.socket
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()


def process_metrics(pid: int) -> dict:
    """Cumulative worker CPU and working set, not host-wide utilization."""
    if os.name == 'nt':
        from ctypes import wintypes as wt
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wt.DWORD), ('faults', wt.DWORD)] + [
                (n, ctypes.c_size_t) for n in ('peak_ws', 'ws', 'peak_pool_paged', 'pool_paged',
                'peak_pool_nonpaged', 'pool_nonpaged', 'pagefile', 'peak_pagefile')]
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        psapi = ctypes.WinDLL('psapi', use_last_error=True)
        kernel.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        kernel.OpenProcess.restype = wt.HANDLE
        kernel.CloseHandle.argtypes = [wt.HANDLE]
        kernel.GetProcessTimes.argtypes = [wt.HANDLE] + [ctypes.POINTER(wt.FILETIME)] * 4
        psapi.GetProcessMemoryInfo.argtypes = [wt.HANDLE, ctypes.POINTER(Counters), wt.DWORD]
        handle = kernel.OpenProcess(0x0400 | 0x0010, False, pid)
        if not handle:
            return {'unavailable': 'OpenProcess failed'}
        try:
            values = [wt.FILETIME() for _ in range(4)]
            counters = Counters()
            counters.cb = ctypes.sizeof(counters)
            result = {}
            if kernel.GetProcessTimes(handle, *[ctypes.byref(x) for x in values]):
                ticks = sum((x.dwHighDateTime << 32) | x.dwLowDateTime for x in values[2:])
                result['cpu_s'] = ticks / 10_000_000
            if psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
                result['working_set_bytes'] = counters.ws
                result['lifetime_peak_working_set_bytes'] = counters.peak_ws
            return result
        finally:
            kernel.CloseHandle(handle)
    if platform.system() == 'Linux':
        try:
            fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
            status = dict(line.split(':', 1) for line in Path(f'/proc/{pid}/status').read_text().splitlines())
            return {'cpu_s': (int(fields[11]) + int(fields[12])) / os.sysconf('SC_CLK_TCK'),
                    'working_set_bytes': int(status['VmRSS'].split()[0]) * 1024,
                    'lifetime_peak_working_set_bytes': int(status['VmHWM'].split()[0]) * 1024}
        except (OSError, KeyError, ValueError):
            return {'unavailable': 'proc metrics failed'}
    return {'unavailable': 'unsupported diagnostic host'}


class Worker:
    def __init__(self, server: Path, model: Path, threads: int):
        self.server, self.model, self.threads = server, model, threads
        self.temp: tempfile.TemporaryDirectory | None = None
        self.process: subprocess.Popen | None = None
        self.log = None

    def __enter__(self) -> 'Worker':
        self.temp = tempfile.TemporaryDirectory(prefix='ud-preview-bench-')
        root = Path(self.temp.name)
        (root / 'public').mkdir()
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            self.port = probe.getsockname()[1]
        self.route = '/universal-dictate-benchmark-' + uuid.uuid4().hex
        self.log = (root / 'worker.log').open('wb')
        begin = time.perf_counter()
        try:
            self.process = subprocess.Popen([
                str(self.server), '-m', str(self.model), '-t', str(self.threads), '-nt', '-ng',
                '--host', '127.0.0.1', '--port', str(self.port), '--request-path', self.route,
                '--public', str(root / 'public'),
            ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=self.log,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError('pinned worker exited during startup')
                connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=0.5)
                try:
                    connection.request('GET', self.route + '/health')
                    response = connection.getresponse()
                    response.read(1024)
                    if response.status == 200:
                        self.startup_ms = (time.perf_counter() - begin) * 1000
                        return self
                except (OSError, http.client.HTTPException):
                    pass
                finally:
                    connection.close()
                time.sleep(0.1)
            raise TimeoutError('pinned worker did not become healthy')
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def infer(self, wav: bytes, language: str) -> dict:
        assert self.process is not None
        before = process_metrics(self.process.pid)
        result = LocalRequest(self.port, self.route, wav, language).run()
        after = process_metrics(self.process.pid)
        result['worker'] = after
        if 'cpu_s' in before and 'cpu_s' in after:
            result['cpu_s'] = max(0, after['cpu_s'] - before['cpu_s'])
            result['mean_core_equivalents'] = result['cpu_s'] / max(1e-9, result['elapsed_ms'] / 1000)
        return result

    def __exit__(self, *_args) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        if self.log is not None:
            self.log.close()
        if self.temp is not None:
            self.temp.cleanup()


def replay(pcm: bytes, infer: Callable, language: str, width: float | None,
           duration: float, interval: float = 2.0, clock=time.perf_counter, sleep=time.sleep) -> dict:
    """Paced prerecorded replay: one request, latest audio at dispatch, no queue.

    Completion after Stop is discarded. This baseline WAITS for the active decode;
    a separate stop probe tests whether socket abort is useful with the pinned binary.
    """
    if not math.isfinite(duration) or duration <= 0 or duration > len(pcm) / (RATE * 2):
        raise ValueError('replay duration exceeds the available fixture')
    if not math.isfinite(interval) or interval <= 0:
        raise ValueError('replay interval must be finite and positive')
    start, next_at, rows = clock(), interval, []
    while next_at < duration:
        sleep(max(0, next_at - (clock() - start)))
        end_s = min(clock() - start, duration)
        if end_s >= duration:
            break
        wav, begin_s, actual_end = snapshot(pcm, end_s, width)
        result = infer(wav, language)
        ready_s = clock() - start
        rows.append(dict(result, audio_start_s=begin_s, audio_end_s=actual_end,
                         ready_s=ready_s, age_at_ready_ms=(ready_s - actual_end) * 1000,
                         displayed=ready_s < duration))
        # Coalesce missed intervals; never replay an old pending request.
        next_at = (math.floor((clock() - start) / interval) + 1) * interval
    sleep(max(0, duration - (clock() - start)))
    final_start = clock() - start
    final = infer(snapshot(pcm, duration, None)[0], language)
    display = [r for r in rows if r['displayed'] and r['nonempty']]
    return {'kind': 'paced_prerecorded_replay_not_live_overlay', 'duration_s': duration,
            'window_s': width, 'interval_s': interval, 'max_inflight': 1,
            'first_nonempty_ready_s': display[0]['ready_s'] if display else None,
            'wait_after_stop_ms': max(0, final_start - duration) * 1000,
            'stop_to_final_ms': (clock() - start - duration) * 1000,
            'preview_results': rows, 'final': final}


def stop_probe(worker: Worker, pcm: bytes, language: str, abort: bool) -> dict:
    preview = LocalRequest(worker.port, worker.route, snapshot(pcm, 64, None)[0], language)
    outcome = {}
    def work() -> None:
        try:
            outcome['result'] = preview.run()
        except Exception as error:
            outcome['error_type'] = type(error).__name__  # Never log response text.
    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    if not preview.sent.wait(5):
        preview.abort()
        thread.join(5)
        raise TimeoutError('preview request was not sent')
    time.sleep(0.15)
    active_at_stop = thread.is_alive()
    if abort:
        preview.abort()
    try:
        final = worker.infer(snapshot(pcm, 12, None)[0], language)
    finally:
        thread.join(125)
        if thread.is_alive():
            preview.abort()
            raise TimeoutError('preview did not settle after Stop probe')
    if not abort and 'error_type' in outcome:
        raise RuntimeError('noncancelled preview failed in Stop probe')
    return {'socket_abort': abort, 'request_active_at_stop': active_at_stop,
            'stop_delay_s': 0.15, 'final': final, 'preview': outcome,
            'interpretation': 'final latency includes contention; client close alone is not proof of native abort'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--wav', type=Path, required=True, help='closed synthetic/public test fixture; no microphone')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=max(1, min(8, (os.cpu_count() or 1) - 2)))
    parser.add_argument('--languages', nargs='+', choices=['en', 'de', 'auto'], default=['en', 'auto'])
    parser.add_argument('--repeats', type=int, default=2)
    parser.add_argument('--allow-local-inference', action='store_true')
    args = parser.parse_args()
    if not args.allow_local_inference:
        parser.error('explicit --allow-local-inference is required')
    if not 1 <= args.threads <= 32 or not 1 <= args.repeats <= 5:
        parser.error('threads must be 1..32 and repeats 1..5')
    for name in ('server', 'model', 'wav'):
        setattr(args, name, getattr(args, name).resolve(strict=True))
    if sha256_file(args.model) != MODEL_SHA256:
        raise ValueError('multilingual base model checksum mismatch')
    pcm = read_pcm(args.wav)
    if len(pcm) < RATE * 2 * 64:
        raise ValueError('benchmark fixture must contain at least 64 seconds')
    report = {'schema': 1, 'status': 'running', 'runtime_pin': 'whisper.cpp 1.9.1',
              'source_commit': os.environ.get('GITHUB_SHA', 'uncommitted'),
              'host': {'system': platform.platform(), 'processor': platform.processor(),
                       'logical_cpus': os.cpu_count(), 'python': platform.python_version()},
              'threads': args.threads, 'model_sha256': MODEL_SHA256,
              'server_sha256': sha256_file(args.server), 'fixture_sha256': sha256_file(args.wav),
              'limitations': ['Synthetic/prerecorded input, not user speech or a microphone/overlay test.',
                             'CPU is worker process CPU seconds; memory peak is lifetime working set.',
                             'No claim of accuracy from a nonempty transcript.',
                             'Language selected is not an implemented translation toggle.'],
              'sweeps': [], 'replays': [], 'stop_probes': []}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with Worker(args.server, args.model, args.threads) as worker:
            report['startup_ms'] = worker.startup_ms
            report['warmup'] = worker.infer(snapshot(pcm, 8, None)[0], args.languages[0])
            if not report['warmup']['nonempty']:
                raise RuntimeError('speech fixture produced no warmup transcript')
            jobs = [(lang, end, width, rep) for lang in args.languages
                    for end in (2, 4, 8, 16, 32, 64) for width in (None, 4, 8, 12)
                    for rep in range(args.repeats)]
            random.Random(31).shuffle(jobs)
            for language, end, width, rep in jobs:
                begin = time.perf_counter()
                wav, start_s, end_s = snapshot(pcm, end, width)
                construction_ms = (time.perf_counter() - begin) * 1000
                result = worker.infer(wav, language)
                report['sweeps'].append(dict(result, language=language, mode='prefix' if width is None else 'window',
                    window_s=width, audio_start_s=start_s, audio_end_s=end_s, repetition=rep,
                    audio_s=end_s - start_s, snapshot_bytes=len(wav), snapshot_construction_ms=construction_ms,
                    rtf=result['elapsed_ms'] / (1000 * (end_s - start_s))))
            for width in (None, 8):
                report['replays'].append(replay(pcm, worker.infer, args.languages[0], width, duration=20))
            report['final_baseline'] = [worker.infer(snapshot(pcm, 12, None)[0], args.languages[0]) for _ in range(3)]
            for _ in range(args.repeats):
                for abort in (False, True):
                    report['stop_probes'].append(stop_probe(worker, pcm, args.languages[0], abort))
            report['status'] = 'completed'
    except Exception as error:
        report['status'] = 'failed'
        report['error_type'] = type(error).__name__
        raise
    finally:
        args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'sweeps': len(report['sweeps']),
                      'median_request_ms': statistics.median(x['elapsed_ms'] for x in report['sweeps'])}))


if __name__ == '__main__':
    main()
