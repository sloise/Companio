<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StaffRequestController extends Controller
{
    public static function shelterKey(string $name, string $address): string
    {
        $normalize = fn ($value) => preg_replace('/\s+/u', ' ', mb_strtolower(trim($value)));

        return hash('sha256', $normalize($name)."\n".$normalize($address));
    }

    public function index(Request $request)
    {
        return response()->json(User::whereIn('role', ['staff_pending', 'staff_rejected', 'admin'])->when($request->boolean('recent'), fn ($q) => $q->where('role', 'staff_pending')->limit(3))->latest('id')->get()->map(function ($user) {
            return [
                'id' => $user->id, 'name' => $user->name, 'email' => $user->archived_email ?? $user->email, 'created_at' => $user->created_at, 'role' => $user->role,
                'shelter_name' => $user->shelter_name, 'shelter_address' => $user->shelter_address,
                'has_id' => (bool) $user->shelter_id_path, 'rejection_reason' => $user->rejection_reason,
                'staff_reviewed_at' => $user->staff_reviewed_at,
                'archived_at' => $user->archived_at,
                'duplicates' => $user->shelter_key ? User::where('shelter_key', $user->shelter_key)->where('id', '!=', $user->id)->get(['id', 'name', 'email', 'role']) : [],
            ];
        }));
    }

    public function document(User $user)
    {
        abort_unless($user->shelter_id_path && Storage::disk('local')->exists($user->shelter_id_path), 404);

        return Storage::disk('local')->response($user->shelter_id_path, 'shelter-id.'.pathinfo($user->shelter_id_path, PATHINFO_EXTENSION), ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff'], 'inline');
    }

    public function approve(Request $request, User $user)
    {
        return $this->decide($request, $user, true);
    }

    public function decline(Request $request, User $user)
    {
        $request->validate(['rejection_reason' => 'required|string|max:2000']);

        return $this->decide($request, $user, false);
    }

    private function decide(Request $request, User $user, bool $approve)
    {
        return DB::transaction(function () use ($request, $user, $approve) {
            $locked = User::lockForUpdate()->findOrFail($user->id);
            abort_unless($locked->role === 'staff_pending', 409, 'This request was already handled.');
            abort_if($approve && (! $locked->shelter_id_path || ! Storage::disk('local')->exists($locked->shelter_id_path)), 422, 'A valid ID is required before approval.');
            $locked->forceFill(['role' => $approve ? 'admin' : 'staff_rejected', 'rejection_reason' => $approve ? null : $request->input('rejection_reason'), 'staff_reviewed_by' => $request->user()->id, 'staff_reviewed_at' => now()])->save();
            $locked->tokens()->delete();

            return response()->json(['message' => $approve ? 'Shelter account approved.' : 'Shelter application rejected.']);
        });
    }
}
