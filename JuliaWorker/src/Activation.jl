module Activation

export activation, safe_activation

# Make activation functions thread-safe
function activation(x)
    return 0.5 * (abs(x + 1) - abs(x - 1))
end

function safe_activation(x)
    x_clamped = clamp(x, -1e6, 1e6)
    return activation(x_clamped)
end

end