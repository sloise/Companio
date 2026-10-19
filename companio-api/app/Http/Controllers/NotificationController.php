<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class NotificationController extends Controller
{
    private function visible(Request $request)
    {
        return $request->user()->appNotifications()
            ->when($request->user()->role !== 'super_admin', fn ($q) => $q->where(fn ($q) => $q->whereNull('link')->orWhere('link', 'not like', '/admin/staff-requests%')))
            // Chat unread state comes from conversation read cursors. Avoid counting its alerts twice.
            ->when($request->boolean('inbox'), fn ($q) => $q->where(fn ($q) => $q->whereNull('link')->orWhere(fn ($q) => $q->where('link', 'not like', '/messages/%')->where('link', 'not like', '/admin/messages/%'))));
    }

    public function index(Request $request)
    {
        $request->validate(['before' => 'nullable|integer|min:1']);
        $query = $this->visible($request);
        $items = (clone $query)->when($request->before, fn ($q) => $q->where('id', '<', $request->before))
            ->latest('id')->limit(20)->get(['id', 'message', 'link', 'read_at', 'created_at']);

        return response()->json([
            'unread' => (clone $query)->whereNull('read_at')->count(),
            'notifications' => $items,
            'has_more' => $items->isNotEmpty() && (clone $query)->where('id', '<', $items->last()->id)->exists(),
        ]);
    }

    public function read(Request $request, int $id)
    {
        $item = $this->visible($request)->findOrFail($id);
        $item->update(['read_at' => $item->read_at ?? now()]);
        return response()->json(['message' => 'Update read.']);
    }

    public function readAll(Request $request)
    {
        $this->visible($request)->whereNull('read_at')->update(['read_at' => now()]);
        return response()->json(['message' => 'Updates marked as read.']);
    }
}
