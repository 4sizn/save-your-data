"""Static server for the test page with HTTP Range support (Safari won't play mp4 without it).

Usage: python3 test/serve.py  (serves test/ on :8080, logs every request to stderr)
"""
import http.server
import os
import re


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start = int(match[1]) if match[1] else max(size - int(match[2] or 0), 0)
        end = min(int(match[2]), size - 1) if match[1] and match[2] else size - 1
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self.range_left = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "range_left", None)
        if left is None:
            return super().copyfile(source, outputfile)
        outputfile.write(source.read(left))


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    http.server.ThreadingHTTPServer(("", 8080), RangeHandler).serve_forever()
