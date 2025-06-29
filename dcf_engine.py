import numpy as np

def compute_dcf(data):
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

    return {
        'gp': gp.tolist(),
        'ebit': ebit.tolist(),
        'fcff': fcff.tolist()
    }
