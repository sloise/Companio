<?php

namespace App\Http\Controllers;

use App\Models\User;

// Admin: confirm or decline shelter staff sign-ups (users with the "staff_pending" role)
class StaffRequestController extends Controller
{
    // READ
    public function index()
    {
        $requests = User::where('role', 'staff_pending')
            ->latest('id')
            ->get(['id', 'name', 'email', 'created_at']);

        return response()->json($requests);
    }

    // UPDATE - approve: the user becomes a shelter admin
    public function approve(User $user)
    {
        if ($user->role !== 'staff_pending') {
            return response()->json(['message' => 'This request was already handled.'], 422);
        }

        $user->update(['role' => 'admin']);

        return response()->json(['message' => "{$user->name} can now sign in as shelter staff."]);
    }

    // DELETE - decline: the request (and account) is removed
    public function decline(User $user)
    {
        if ($user->role !== 'staff_pending') {
            return response()->json(['message' => 'This request was already handled.'], 422);
        }

        $user->delete();

        return response()->json(['message' => 'Staff request declined.']);
    }
}
