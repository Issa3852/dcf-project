from flask import Flask, request, jsonify, send_from_directory
from dcf_engine import compute_dcf

app = Flask(__name__, static_folder='static')

@app.route('/')
def home():
    return send_from_directory('static', 'dcf_editor.html')

@app.route('/api/run_dcf', methods=['POST'])
def run_dcf_api():
    data = request.get_json()
    return jsonify(compute_dcf(data))

if __name__ == '__main__':
    app.run(debug=True, port=5000)
