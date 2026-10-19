<?php

namespace App\Http\Controllers;

use App\Models\Animal;
use App\Models\FosterApplication;
use App\Models\Placement;
use App\Models\User;
use App\Models\VolunteerProfile;
use Illuminate\Http\Request;

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

        // urgent animals with a "needs a home by" date, soonest first
        $deadlines = Animal::where('is_urgent', true)
            ->whereNotNull('needed_by')
            ->whereIn('status', Animal::OPEN_STATUSES)
            ->orderBy('needed_by')
            ->limit(5)
            ->get(['id', 'name', 'species', 'status', 'needed_by']);

        // active placements past their expected return date
        $overdue = Placement::with(['animal:id,name', 'application:id,full_name'])
            ->where('status', 'Active')
            ->whereDate('expected_return_date', '<', now()->toDateString())
            ->orderBy('expected_return_date')
            ->limit(5)
            ->get();

        return response()->json([
            'stats' => $stats,
            'stages' => $stages,
            'recent_applications' => $recent,
            'deadlines' => $deadlines,
            'overdue_placements' => $overdue,
        ]);
    }

    // READ - small numbers for the sidebar badges
    public function counts(Request $request)
    {
        return response()->json([
            'pending_applications' => FosterApplication::where('status', 'Pending')->count(),
            'overdue_placements' => Placement::where('status', 'Active')
                ->whereDate('expected_return_date', '<', now()->toDateString())
                ->count(),
            'pending_profiles' => VolunteerProfile::where('review_status', 'Pending')->count(),
            ...($request->user()->role === 'super_admin' ? ['staff_requests' => User::where('role', 'staff_pending')->count()] : []),
            'foster_requests' => Placement::where('status', 'Active')->whereNotNull('foster_request')->count(),
        ]);
    }
}
