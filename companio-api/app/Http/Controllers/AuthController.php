<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // REGISTER - creates a foster volunteer, or a shelter staff request.
    // Staff requests get the "staff_pending" role: they cannot log in or open admin pages
    // until the Super Admin approves them (see StaffRequestController).
    public function register(Request $request)
    {
        $this->normalizeEmail($request);

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'email' => ['required', 'email', 'max:150', Rule::unique('users', 'email')->where(fn ($q) => $q->where('role', '!=', 'staff_rejected'))],
            'password' => 'required|string|min:8|max:100',
            'account_type' => 'nullable|in:volunteer,shelter',
            'shelter_id' => 'required_if:account_type,shelter|nullable|file|mimes:jpg,jpeg,png,pdf|extensions:jpg,jpeg,png,pdf|max:4096',
            'role' => 'prohibited',
            'approval_status' => 'prohibited',
            'status' => 'prohibited',
        ]);

        $isShelter = ($validated['account_type'] ?? 'volunteer') === 'shelter';

        $path = $isShelter ? $request->file('shelter_id')->store('shelter-ids', 'local') : null;
        abort_if($isShelter && ! $path, 500, 'Unable to store ID. Please try again.');
        try {
            $user = DB::transaction(function () use ($validated, $isShelter, $path) {
                $previous = User::where('email', $validated['email'])->lockForUpdate()->first();
                if ($previous) {
                    if ($previous->role !== 'staff_rejected') {
                        throw ValidationException::withMessages(['email' => 'This email is already registered.']);
                    }
                    $previous->tokens()->delete();
                    $previous->forceFill([
                        'archived_email' => $previous->email,
                        'archived_at' => now(),
                        'email' => Str::uuid().'@rejected.invalid',
                        'password' => Str::random(64),
                    ])->save();
                }
                DB::table('password_reset_tokens')->where('email', $validated['email'])->delete();
                $user = User::create([
                    'name' => $validated['name'],
                    'email' => $validated['email'],
                    'password' => $validated['password'],   // hashed by the User model cast
                    'role' => $isShelter ? 'staff_pending' : 'volunteer',
                ]);

                if ($isShelter) {
                    $user->forceFill([
                        'shelter_id_path' => $path,
                    ])->save();
                }

                return $user;
            });
        } catch (\Throwable $error) {
            if ($path) {
                Storage::disk('local')->delete($path);
            }
            throw $error;
        }
        if ($isShelter) {
            return response()->json([
                'message' => 'Request sent. The Super Admin will review your shelter account before you can sign in.',
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
        $this->normalizeEmail($request);

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

        if (in_array($user->role, ['staff_pending', 'staff_rejected'], true)) {
            throw ValidationException::withMessages([
                'email' => [$user->role === 'staff_rejected' ? 'Your shelter application was rejected.' : 'Your shelter account is waiting for Super Admin approval.'],
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
        $this->normalizeEmail($request);

        $request->validate(['email' => 'required|email']);

        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'If that email has an account, a reset link is on its way. Check your inbox.',
        ]);
    }

    // RESET PASSWORD - uses the token from the email link
    public function resetPassword(Request $request)
    {
        $this->normalizeEmail($request);

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

    // " Andrea@Email.com " and "andrea@email.com" are the same person - always store / compare in lowercase
    private function normalizeEmail(Request $request): void
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }
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
