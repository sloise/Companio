<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
