/*
 * Universal Dictate - Windows microphone recorder
 *
 * Uses miniaudio for capture and WAV encoding. miniaudio is fetched and
 * statically compiled at build time; it is not a runtime dependency.
 *
 * Protocol (stdout):
 *   READY
 *   LEVEL <0.000..1.000>
 *   STOPPED <output-path>
 *   CANCELLED
 *
 * Commands (stdin):
 *   STOP\n
 *   CANCEL\n
 *
 * SPDX-License-Identifier: MIT
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "miniaudio.h"

#define SAMPLE_RATE 16000
#define CHANNELS 1
#define LEVEL_INTERVAL_MS 50

static volatile LONG g_command = 0; /* 0=record, 1=stop, 2=cancel */
static volatile LONG g_peak_milli = 0;

static void data_callback(ma_device* device, void* output, const void* input, ma_uint32 frame_count) {
    ma_encoder* encoder = (ma_encoder*)device->pUserData;
    const ma_int16* samples = (const ma_int16*)input;
    int peak = 0;

    if (input != NULL && frame_count > 0) {
        ma_encoder_write_pcm_frames(encoder, input, frame_count, NULL);

        for (ma_uint32 i = 0; i < frame_count * CHANNELS; ++i) {
            int value = samples[i];
            if (value < 0) value = -value;
            if (value > peak) peak = value;
        }

        if (peak > 32767) peak = 32767;
        InterlockedExchange(&g_peak_milli, (LONG)((peak * 1000L) / 32767L));
    }

    (void)output;
}

static DWORD WINAPI command_thread(LPVOID unused) {
    char line[64];
    (void)unused;

    while (fgets(line, sizeof(line), stdin) != NULL) {
        if (_strnicmp(line, "CANCEL", 6) == 0) {
            InterlockedExchange(&g_command, 2);
            return 0;
        }
        if (_strnicmp(line, "STOP", 4) == 0) {
            InterlockedExchange(&g_command, 1);
            return 0;
        }
    }

    /* Parent pipe closed: stop cleanly rather than recording indefinitely. */
    InterlockedCompareExchange(&g_command, 1, 0);
    return 0;
}

int main(int argc, char** argv) {
    ma_encoder_config encoder_config;
    ma_encoder encoder;
    ma_device_config device_config;
    ma_device device;
    ma_result result;
    HANDLE command_handle;
    const char* output_path = NULL;
    LONG previous_level = -1;

    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_path = argv[++i];
        }
    }

    if (output_path == NULL || output_path[0] == '\0') {
        fprintf(stderr, "ERROR missing --output path\n");
        return 2;
    }

    /* whisper-cli accepts 16-bit PCM WAV directly. */
    encoder_config = ma_encoder_config_init(
        ma_encoding_format_wav,
        ma_format_s16,
        CHANNELS,
        SAMPLE_RATE
    );

    result = ma_encoder_init_file(output_path, &encoder_config, &encoder);
    if (result != MA_SUCCESS) {
        fprintf(stderr, "ERROR encoder init failed: %d\n", (int)result);
        return 3;
    }

    device_config = ma_device_config_init(ma_device_type_capture);
    device_config.capture.format = encoder.config.format;
    device_config.capture.channels = encoder.config.channels;
    device_config.sampleRate = encoder.config.sampleRate;
    device_config.dataCallback = data_callback;
    device_config.pUserData = &encoder;

    result = ma_device_init(NULL, &device_config, &device);
    if (result != MA_SUCCESS) {
        ma_encoder_uninit(&encoder);
        DeleteFileA(output_path);
        fprintf(stderr, "ERROR capture device init failed: %d\n", (int)result);
        return 4;
    }

    result = ma_device_start(&device);
    if (result != MA_SUCCESS) {
        ma_device_uninit(&device);
        ma_encoder_uninit(&encoder);
        DeleteFileA(output_path);
        fprintf(stderr, "ERROR capture device start failed: %d\n", (int)result);
        return 5;
    }

    command_handle = CreateThread(NULL, 0, command_thread, NULL, 0, NULL);
    if (command_handle == NULL) {
        ma_device_uninit(&device);
        ma_encoder_uninit(&encoder);
        DeleteFileA(output_path);
        fprintf(stderr, "ERROR command thread creation failed: %lu\n", GetLastError());
        return 6;
    }

    printf("READY\n");
    fflush(stdout);

    while (InterlockedCompareExchange(&g_command, 0, 0) == 0) {
        LONG level = InterlockedExchange(&g_peak_milli, 0);
        if (level != previous_level) {
            printf("LEVEL %.3f\n", (double)level / 1000.0);
            fflush(stdout);
            previous_level = level;
        }
        Sleep(LEVEL_INTERVAL_MS);
    }

    ma_device_uninit(&device);
    ma_encoder_uninit(&encoder);

    LONG command = InterlockedCompareExchange(&g_command, 0, 0);
    if (command == 2) {
        DeleteFileA(output_path);
        printf("CANCELLED\n");
    } else {
        printf("STOPPED %s\n", output_path);
    }
    fflush(stdout);

    WaitForSingleObject(command_handle, 1000);
    CloseHandle(command_handle);

    return 0;
}
