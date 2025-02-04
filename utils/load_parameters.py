import pickle
import gc
import numpy as np

def load_parameters_for_mode(mode):
    with open('settings.pkl', 'rb') as f:
        settings = pickle.load(f)
    parameters = {
        'A': settings[f'{mode}A'],
        'B': settings[f'{mode}B'],
        't': settings[f'{mode}t'],
        'Ib': settings[f'{mode}Ib'],
        'init': settings[f'{mode}init']
    }
    gc.collect()
    return parameters
