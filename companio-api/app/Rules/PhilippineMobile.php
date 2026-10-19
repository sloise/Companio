<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class PhilippineMobile implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! preg_match('/^(09[0-9]{9}|\+639[0-9]{9})$/D', $value)) {
            $fail('Use a Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX.');
        }
    }

    public static function normalize(mixed $value): mixed
    {
        return is_string($value) && str_starts_with($value, '+639') ? '0'.substr($value, 3) : $value;
    }
}
