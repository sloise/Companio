<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // REGISTER - creates a foster volunteer, or a shelter staff request.
    // Staff requests get the "staff_pending" role: they cannot log in or open admin pages
    // until an existing admin approves them (see StaffRequestController).
    public function register(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:150|unique:users,email',
            'password' => 'required|string|min:8|max:100',
            'account_type' => 'nullable|in:volunteer,shelter',
        ]);

        $isShelter = ($validated['account_type'] ?? 'volunteer') === 'shelter';

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],   // hashed by the User model cast
            'role' => $isShelter ? 'staff_pending' : 'volunteer',
        ]);

        if ($isShelter) {
            return response()->json([
                'message' => 'Request sent. An administrator will confirm your shelter account before you can sign in.',
                'pending' => true,
            ], 201);
        }

        return response()->json([
            'message' => 'Account created successfully.',
            'token' => $user->createToken('companio')->plainTextToken,
            'user' => $user,
        ], 201);
    }

    // LOGIN
    public function login(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $validated['email'])->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Wrong email or password.'],
            ]);
        }

        if ($user->role === 'staff_pending') {
            throw ValidationException::withMessages([
                'email' => ['Your shelter account is still waiting for an administrator to confirm it.'],
            ]);
        }

        return response()->json([
            'message' => 'Logged in successfully.',
            'token' => $user->createToken('companio')->plainTextToken,
            'user' => $user,
        ]);
    }

    // FORGOT PASSWORD - emails a reset link.
    // Always gives the same answer so nobody can use this to check which emails have accounts.
    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'If that email has an account, a reset link is on its way. Check your inbox.',
        ]);
    }

    // RESET PASSWORD - uses the token from the email link
    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:8|max:100|confirmed',
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save(); // hashed by the User model cast
                $user->tokens()->delete(); // log out every device
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => ['This reset link is invalid or has expired. Please request a new one.'],
            ]);
        }

        return response()->json(['message' => 'Your password was changed. You can sign in now.']);
    }

    // CURRENT USER
    public function me(Request $request)
    {
        return response()->json($request->user());
    }

    // LOGOUT - deletes the token used for this request
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out successfully.']);
    }
}
