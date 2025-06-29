from flask import Flask, render_template, request, jsonify
import numpy as np

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('dcf_editor.html')

@app.route('/api/run_dcf', methods=['POST'])
def run_dcf():
    data = request.get_json()

    rev = np.array(data['revenue'])
    cogs = np.array(data['cogs'])
    sga = np.array(data['sga'])
    rnd = np.array(data['rnd'])
    tax_rate = np.array(data['tax_rate'])
    da = np.array(data['da'])
    capex = np.array(data['capex'])
    wc = np.array(data['wc'])

    gp = rev - cogs
    ebit = gp - sga - rnd
    nopat = ebit * (1 - tax_rate / 100)
    fcff = nopat + da + capex - wc

    result = {
        'gp': gp.tolist(),
        'ebit': ebit.tolist(),
        'fcff': fcff.tolist()
    }

    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
