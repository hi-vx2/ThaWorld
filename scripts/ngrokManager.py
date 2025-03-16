import sys
import json
from pyngrok import ngrok

def start_ngrok():
    try:
        ngrok.set_auth_token('2XOtEWfJaMY5bBc2NVUDINE4T4p_839uZHBAiyCpkuta329Am')
        tunnel = ngrok.connect(25565, 'tcp')
        return {'status': 'success', 'url': tunnel.public_url}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

def stop_ngrok():
    try:
        ngrok.kill()
        return {'status': 'success', 'message': 'Ngrok stopped'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'status': 'error', 'message': 'No method provided'}))
        sys.exit(1)

    method = sys.argv[1]
    if method == 'start':
        result = start_ngrok()
    elif method == 'stop':
        result = stop_ngrok()
    else:
        result = {'status': 'error', 'message': 'Unknown method'}

    print(json.dumps(result))