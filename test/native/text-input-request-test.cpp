#include "../../native/text-input-request.h"
#include <stdexcept>
using namespace universal_dictate::text_input;
#include <iostream>

namespace {
void requireRequest(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}
class RequestPipe {
public:
    RequestPipe() : original_(GetStdHandle(STD_INPUT_HANDLE)) {
        if (!CreatePipe(&reader_, &writer_, nullptr, 4096)) throw std::runtime_error("CreatePipe failed");
        if (!SetStdHandle(STD_INPUT_HANDLE, reader_)) {
            CloseHandle(reader_); CloseHandle(writer_);
            throw std::runtime_error("SetStdHandle failed");
        }
    }
    RequestPipe(const RequestPipe&) = delete;
    RequestPipe& operator=(const RequestPipe&) = delete;
    ~RequestPipe() {
        SetStdHandle(STD_INPUT_HANDLE, original_);
        if (reader_) CloseHandle(reader_);
        if (writer_) CloseHandle(writer_);
    }
    void write(std::string_view text) {
        DWORD written = 0;
        requireRequest(WriteFile(writer_, text.data(), static_cast<DWORD>(text.size()), &written, nullptr)
                       && written == text.size(), "pipe write failed");
    }
    void cancel() { if (writer_) { CloseHandle(writer_); writer_ = nullptr; } }
private:
    HANDLE original_, reader_ = nullptr, writer_ = nullptr;
};
}

int main() {
    int passed = 0;
    auto test = [&](const char* name, auto body) {
        body(); ++passed; std::cout << "PASS " << name << '\n';
    };
    try {
        test("complete frame returns without waiting for EOF; disconnect requests cancel", [] {
            RequestPipe pipe; pipe.write("UDTI1 5\nhello"); std::wstring text;
            requireRequest(readTranscript(text) && text == L"hello", "frame read failed");
            requireRequest(!requestCancelled(), "open empty pipe wrongly cancelled");
            pipe.cancel(); requireRequest(requestCancelled(), "EOF failed to cancel");
        });
        test("exact UTF-8 byte length is decoded", [] {
            RequestPipe pipe; pipe.write("UDTI1 3\n\xe6\xb0\xb4"); std::wstring text;
            requireRequest(readTranscript(text) && text == L"\u6c34", "Unicode frame changed");
        });
        test("extra bytes cancel rather than becoming another request", [] {
            RequestPipe pipe; pipe.write("UDTI1 5\nhelloX"); std::wstring text;
            requireRequest(readTranscript(text), "frame invalid");
            requireRequest(requestCancelled(), "trailing bytes accepted");
        });
        for (const auto* invalid : {"UDTI0 5\nhello", "UDTI1 0\n", "UDTI1 4194305\n",
                                    "UDTI1 -1\n", "UDTI1 3junk\n", "UDTI1 10\nshort"}) {
            test("invalid/truncated frame rejected", [invalid] {
                RequestPipe pipe; pipe.write(invalid); pipe.cancel(); std::wstring text;
                requireRequest(!readTranscript(text), "invalid frame accepted");
            });
        }
        test("invalid UTF-8 rejected", [] {
            RequestPipe pipe; pipe.write("UDTI1 2\n\xc3\x28"); std::wstring text;
            requireRequest(!readTranscript(text), "invalid UTF-8 accepted");
        });
        test("embedded null rejected", [] {
            RequestPipe pipe; const std::string frame("UDTI1 3\na\0b", 11); pipe.write(frame); std::wstring text;
            requireRequest(!readTranscript(text), "embedded null accepted");
        });
        test("closed writer before request is rejected", [] {
            RequestPipe pipe; pipe.cancel(); std::wstring text;
            requireRequest(!readTranscript(text) && requestCancelled(), "absent request accepted");
        });
        std::cout << passed << " Win32 request/lifetime tests passed (no clipboard writes or keystrokes)\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "FAIL request/lifetime test: " << error.what() << '\n';
        return 1;
    }
}
