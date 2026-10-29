#!/usr/bin/env python3
"""六博·汉局 — 手机局域网备用静态服务器。

用途：
- 主服务器 scripts/serve.mjs 已绑定 0.0.0.0，但某些 Windows 电脑的防火墙
  会阻止 node.exe 入站，而系统可能已允许 python.exe。
- 本脚本只使用 Python 标准库，不提供任何动态接口，与主服务器内容一致。

用法：
    python scripts/serve_lan.py --port 4174
    python scripts/serve_lan.py --port 4174 --host 0.0.0.0
"""

from __future__ import annotations

import argparse
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class LanRequestHandler(http.server.SimpleHTTPRequestHandler):
    """带正确 MIME、禁用缓存的静态文件处理器。"""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.md': 'text/markdown; charset=utf-8',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, format_string, *args):
        # 不输出每个静态请求，避免手机加载时刷屏。
        if getattr(self.server, 'verbose', False):
            super().log_message(format_string, *args)


class ThreadingServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def lan_addresses() -> list[str]:
    try:
        _, _, addresses = socket.gethostbyname_ex(socket.gethostname())
    except OSError:
        return []

    unique = []
    for address in addresses:
        if address.startswith('127.') or address == '0.0.0.0':
            continue
        if address not in unique:
            unique.append(address)

    # 家用/办公局域网地址优先显示。
    def rank(value: str) -> tuple[int, str]:
        if value.startswith('192.168.'):
            return (0, value)
        if value.startswith('10.'):
            return (1, value)
        if value.startswith('172.'):
            return (2, value)
        return (3, value)

    return sorted(unique, key=rank)


def main() -> int:
    parser = argparse.ArgumentParser(description='六博·汉局手机局域网静态服务器')
    parser.add_argument('--port', type=int, default=4174, help='监听端口，默认 4174')
    parser.add_argument('--host', default='0.0.0.0', help='监听地址，默认 0.0.0.0')
    parser.add_argument('--verbose', action='store_true', help='输出每个请求')
    args = parser.parse_args()

    try:
        server = ThreadingServer((args.host, args.port), LanRequestHandler)
    except OSError as error:
        print(f'启动失败：{error}', file=sys.stderr)
        print('若端口已被占用，请换一个端口，例如 --port 4175。', file=sys.stderr)
        return 1

    server.verbose = args.verbose
    port = server.server_address[1]

    print('')
    print('六博·汉局 · 手机局域网服务')
    print(f'电脑访问：http://127.0.0.1:{port}')

    if args.host in ('0.0.0.0', '::'):
        addresses = lan_addresses()
        if addresses:
            print('')
            print('手机访问（手机与电脑需连同一个 Wi-Fi）：')
            for address in addresses:
                suffix = '  [可能是 VPN/虚拟网卡，手机通常用 192.168 或 10 开头]' if address.startswith(('198.19.', '172.20.')) else ''
                print(f'  http://{address}:{port}{suffix}')
        else:
            print('未发现局域网 IPv4 地址，请检查 Wi-Fi。')

    print('')
    print('按 Ctrl+C 停止。')
    print('')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
