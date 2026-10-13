<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;

class DashboardController extends Controller
{
    // READ - key numbers, the placement pipeline and the newest requests
    public function stats()
    {
        $stages = [];

        foreach (Animal::STATUSES as $status) {
            $stages[] = [
                'name' => $status,
                'count' => Animal::where('status', $status)->count(),
                'animals' => Animal::where('status', $status)
                    ->latest('updated_at')
                    ->limit(4)
                    ->get(['id', 'name', 'species', 'age', 'is_urgent', 'status']),
            ];
        }

        $stats = [
            'awaiting_foster' => Animal::where('status', 'Awaiting Foster')->count(),
            'urgent_awaiting' => Animal::where('status', 'Awaiting Foster')->where('is_urgent', true)->count(),
            'pending_applications' => FosterApplication::where('status', 'Pending')->count(),
            'pending_older_than_2_days' => FosterApplication::where('status', 'Pending')
                ->where('created_at', '<=', now()->subDays(2))
                ->count(),
            'in_foster_care' => Animal::where('status', 'In Foster Care')->count(),
            'due_back_this_week' => Placement::where('status', 'Active')
                ->whereBetween('expected_return_date', [now()->toDateString(), now()->addDays(7)->toDateString()])
                ->count(),
            'adopted_this_month' => Animal::where('status', 'Adopted')
                ->where('updated_at', '>=', now()->startOfMonth())
                ->count(),
        ];

        $recent = FosterApplication::with(['user:id,name,email', 'animal:id,name'])
            ->where('status', 'Pending')
            ->latest('id')
            ->limit(5)
            ->get();

        return response()->json([
            'stats' => $stats,
            'stages' => $stages,
            'recent_applications' => $recent,
        ]);
    }
}
