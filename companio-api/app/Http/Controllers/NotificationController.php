<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

// The volunteer's in-app notifications (the bell in the top bar)
class NotificationController extends Controller
{
    // READ - newest 20, plus how many are unread
    public function index(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'unread' => $user->appNotifications()->whereNull('read_at')->count(),
            'notifications' => $user->appNotifications()
                ->latest('id')
                ->limit(20)
                ->get(['id', 'message', 'link', 'read_at', 'created_at']),
        ]);
    }

    // UPDATE - mark everything as read (when the bell is opened)
    public function readAll(Request $request)
    {
        $request->user()->appNotifications()
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['message' => 'Notifications marked as read.']);
    }
}
