module Activation

export activation, safe_activation

function activation(x)
    return 0.5 .* (abs.(x .+ 1) .- abs.(x .- 1))
end

function safe_activation(x)
    x_clamped = clamp.(x, -1e6, 1e6)  # Prevent extremely large values
    return activation(x_clamped)
end

end