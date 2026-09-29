"""Mechanics tests only. No Whisper inference is mocked into a performance claim."""
import concurrent.futures
import hashlib
import http.server
import importlib.util
import io
import os
from pathlib import Path
import struct
import tempfile
import threading
import time
import unittest
import wave

SPEC = importlib.util.spec_from_file_location('preview_benchmark', Path(__file__).parents[1] / 'test' / 'preview' / 'benchmark.py')
bench = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bench)


class WavTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'fixture.wav'
        self.pcm = struct.pack('<h', 117) * (bench.RATE * 10)

    def tearDown(self):
        self.temp.cleanup()

    def parse(self, raw):
        self.path.write_bytes(raw)
        return bench.read_pcm(self.path)

    def test_roundtrip(self):
        self.assertEqual(self.parse(bench.make_wav(self.pcm)), self.pcm)

    def test_closed_canonical_header(self):
        raw = bench.make_wav(self.pcm)
        self.assertEqual(len(raw), len(self.pcm) + 44)
        self.assertEqual(struct.unpack_from('<I', raw, 4)[0] + 8, len(raw))
        self.assertEqual(struct.unpack_from('<I', raw, 40)[0], len(self.pcm))

    def test_reject_truncated_pcm(self):
        with self.assertRaises(ValueError):
            self.parse(bench.make_wav(self.pcm)[:-2])

    def test_reject_unfinished_header(self):
        raw = bytearray(bench.make_wav(self.pcm))
        struct.pack_into('<I', raw, 4, 0)
        struct.pack_into('<I', raw, 40, 0)
        with self.assertRaises(ValueError):
            self.parse(raw)

    def test_reject_trailing_data(self):
        with self.assertRaises(ValueError):
            self.parse(bench.make_wav(self.pcm) + b'not audio')

    def test_reject_wrong_audio_format(self):
        for offset, value in ((20, 3), (22, 2), (24, 48000), (32, 4), (34, 32)):
            with self.subTest(offset=offset):
                raw = bytearray(bench.make_wav(self.pcm))
                struct.pack_into('<H' if offset != 24 else '<I', raw, offset, value)
                with self.assertRaises(ValueError):
                    self.parse(raw)

    def test_skip_valid_metadata(self):
        raw = bench.make_wav(self.pcm)
        extra = b'JUNK' + struct.pack('<I', 3) + b'abc\0'
        result = bytearray(raw[:12] + extra + raw[12:])
        struct.pack_into('<I', result, 4, len(result) - 8)
        self.assertEqual(self.parse(result), self.pcm)

    def test_reject_duplicate_data(self):
        raw = bench.make_wav(self.pcm)
        result = bytearray(raw + b'data' + struct.pack('<I', 2) + b'xx')
        struct.pack_into('<I', result, 4, len(result) - 8)
        with self.assertRaises(ValueError):
            self.parse(result)

    def test_reject_unaligned_empty_and_oversized(self):
        for pcm in (b'', b'x', b'xx' * (bench.MAX_FIXTURE_BYTES // 2 + 1)):
            with self.assertRaises(ValueError):
                bench.make_wav(pcm)

    def test_prefix_preserves_source(self):
        original = hashlib.sha256(self.pcm).hexdigest()
        raw, begin, end = bench.snapshot(self.pcm, 8, None)
        self.assertEqual((begin, end), (0, 8))
        self.assertEqual(self.parse(raw), self.pcm[:8 * bench.RATE * 2])
        self.assertEqual(hashlib.sha256(self.pcm).hexdigest(), original)

    def test_rolling_window_is_bounded(self):
        raw, begin, end = bench.snapshot(self.pcm, 10, 4)
        self.assertEqual((begin, end), (6, 10))
        self.assertEqual(len(raw), 44 + 4 * bench.RATE * 2)

    def test_window_before_full_length(self):
        raw, begin, end = bench.snapshot(self.pcm, 2, 8)
        self.assertEqual((begin, end), (0, 2))
        self.assertEqual(len(raw), 44 + 2 * bench.RATE * 2)

    def test_end_is_clamped_and_frame_aligned(self):
        raw, begin, end = bench.snapshot(self.pcm, 100, 4)
        self.assertEqual((begin, end), (6, 10))
        raw, begin, end = bench.snapshot(self.pcm, 1.00001, 1)
        self.assertEqual((begin, end), (0, 1))

    def test_reject_nonfinite_or_negative_windows(self):
        for value in (-1, 0, float('inf'), float('nan')):
            with self.assertRaises(ValueError):
                bench.snapshot(self.pcm, value, 1)
            with self.assertRaises(ValueError):
                bench.snapshot(self.pcm, 1, value)

    def test_hash_stream(self):
        self.path.write_bytes(self.pcm)
        self.assertEqual(bench.sha256_file(self.path), hashlib.sha256(self.pcm).hexdigest())


class ReplayTests(unittest.TestCase):
    def exercise(self, decode_s, duration=12):
        state = {'time': 0.0, 'calls': 0}
        pcm = b'\0\0' * bench.RATE * 20
        def clock():
            return state['time']
        def sleep(value):
            state['time'] += value
        def infer(_wav, _lang):
            state['calls'] += 1
            state['time'] += decode_s
            return {'nonempty': True, 'elapsed_ms': decode_s * 1000}
        result = bench.replay(pcm, infer, 'en', 4, duration, clock=clock, sleep=sleep)
        return result, state

    def test_slow_decode_coalesces_missed_ticks(self):
        result, state = self.exercise(5)
        self.assertEqual([x['audio_end_s'] for x in result['preview_results']], [2, 8])
        self.assertEqual(state['calls'], 3)  # Two previews, one final. No queue drain.
        self.assertEqual(result['max_inflight'], 1)

    def test_late_preview_not_displayed_and_final_once(self):
        result, state = self.exercise(5)
        self.assertEqual([x['displayed'] for x in result['preview_results']], [True, False])
        self.assertEqual(result['wait_after_stop_ms'], 1000)
        self.assertEqual(result['stop_to_final_ms'], 6000)
        self.assertEqual(state['calls'], len(result['preview_results']) + 1)

    def test_fast_decode_has_no_stop_wait(self):
        result, _state = self.exercise(0.25)
        self.assertEqual(result['first_nonempty_ready_s'], 2.25)
        self.assertEqual(result['wait_after_stop_ms'], 0)
        self.assertEqual(result['stop_to_final_ms'], 250)


class TransportTests(unittest.TestCase):
    def test_matches_current_production_fields(self):
        wav = bench.make_wav(b'\0\0' * 20)
        boundary, body = bench.multipart(wav, 'de')
        self.assertIn(b'name="language"\r\n\r\nde\r\n', body)
        self.assertIn(b'name="response_format"\r\n\r\ntext\r\n', body)
        self.assertIn(b'name="no_timestamps"\r\n\r\ntrue\r\n', body)
        self.assertNotIn(b'name="translate"', body)
        self.assertEqual(body.count(wav), 1)
        self.assertTrue(body.endswith(f'--{boundary}--\r\n'.encode()))

    def test_reject_language_injection(self):
        with self.assertRaises(ValueError):
            bench.multipart(b'xx', 'en\r\nX-Evil: yes')

    def test_local_http_real_socket_and_abort(self):
        seen = []
        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_POST(self):
                seen.append((self.path, self.rfile.read(int(self.headers['Content-Length']))))
                if self.path.startswith('/slow'):
                    time.sleep(0.25)
                status = 503 if self.path.startswith('/bad') else 200
                body = 'Grüße\n water'.encode()
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        serve = threading.Thread(target=server.serve_forever, daemon=True)
        serve.start()
        try:
            wav = bench.make_wav(b'\0\0' * 20)
            normal = bench.LocalRequest(server.server_port, '/test', wav, 'en').run()
            self.assertTrue(normal['nonempty'])
            self.assertEqual(normal['characters'], len('Grüße water'))
            self.assertNotIn('text', normal)
            self.assertEqual(seen[0][0], '/test/inference')
            with self.assertRaises(RuntimeError):
                bench.LocalRequest(server.server_port, '/bad', wav, 'en').run()
            request = bench.LocalRequest(server.server_port, '/slow', wav, 'en')
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(request.run)
                self.assertTrue(request.sent.wait(2))
                request.abort()
                with self.assertRaises((OSError, http.client.HTTPException)):
                    future.result(timeout=2)
        finally:
            server.shutdown()
            server.server_close()
            serve.join(2)

    def test_own_process_metrics(self):
        result = bench.process_metrics(os.getpid())
        if 'unavailable' not in result:
            self.assertGreaterEqual(result['cpu_s'], 0)
            self.assertGreater(result['working_set_bytes'], 0)
            self.assertGreaterEqual(result['lifetime_peak_working_set_bytes'], result['working_set_bytes'])


if __name__ == '__main__':
    unittest.main()
