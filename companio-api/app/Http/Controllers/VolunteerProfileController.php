<?php

namespace App\Http\Controllers;

use App\Models\UserNotification;
use App\Models\VolunteerProfile;
use App\Rules\PhilippineMobile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VolunteerProfileController extends Controller
{
    public function show(Request $request)
    {
        $profile = $request->user()->volunteerProfile;
        if (! $profile) {
            return response('null', 200, ['Content-Type' => 'application/json']);
        }

        return response()->json($this->data($profile));
    }

    private function data(VolunteerProfile $profile): array
    {
        return array_merge($profile->toArray(), ['next_edit_at' => $profile->last_edited_at?->copy()->addDays(7)->toIso8601String()]);
    }

    public function update(Request $request)
    {
        if (! $request->user()->volunteerProfile()->exists()) {
            $request->merge(['name' => $request->user()->name]);
        }
        $request->merge(['phone' => PhilippineMobile::normalize($request->input('phone')), 'emergency_phone' => PhilippineMobile::normalize($request->input('emergency_phone'))]);
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'phone' => ['required', 'string', new PhilippineMobile],
            'address' => 'required|string|max:255',
            'birth_date' => 'required|date|before:today',
            'emergency_name' => 'required|string|max:100|different:name',
            'emergency_phone' => ['required', 'string', 'different:phone', new PhilippineMobile],
            'housing_type' => 'required|in:apartment,house,townhouse,dormitory',
            'yard' => 'required|in:none,small,fenced',
            'has_cats' => 'required|boolean', 'has_dogs' => 'required|boolean',
            'kids' => 'required|in:none,older,young', 'hours_alone' => 'required|in:0,4,8,12',
            'experience' => 'required|in:first_time,some,experienced',
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $user = $request->user()->newQuery()->lockForUpdate()->findOrFail($request->user()->id);
            $profile = $user->volunteerProfile;
            if ($profile?->last_edited_at && $profile->last_edited_at->copy()->addDays(7)->isFuture()) {
                return response()->json(['message' => 'Profile edits are limited to once every seven days. Contact the shelter for urgent corrections.', 'next_edit_at' => $profile->last_edited_at->copy()->addDays(7)->toIso8601String()], 429);
            }
            if (! $profile) {
                $validated['name'] = $user->name;
            }
            $user->update(['name' => $validated['name']]);
            unset($validated['name']);
            $profile = VolunteerProfile::updateOrCreate(['user_id' => $user->id], array_merge($validated, [
                'review_status' => 'Pending', 'review_notes' => null, 'reviewed_by' => null, 'last_edited_at' => now(),
            ]));
            // Previously collected verification cannot approve an application after the home changes.
            $user->applications()->where('status', 'Pending')->update(['verification_completed_at' => null, 'verified_by' => null]);

            return response()->json(['message' => 'Profile saved. Shelter re-screening is required before applying.', 'profile' => $this->data($profile), 'user' => $user]);
        });
    }

    // Cosmetic photos do not alter screened household details or their edit cooldown.
    public function updatePhoto(Request $request)
    {
        $request->validate(['photo' => 'required|image|mimes:jpg,jpeg,png,webp|max:4096']);
        $source = @imagecreatefromstring(file_get_contents($request->file('photo')->getRealPath()));
        abort_unless($source, 422, 'This image could not be read. Choose another photo.');
        $size = min(imagesx($source), imagesy($source));
        $photo = imagecreatetruecolor(320, 320);
        imagefill($photo, 0, 0, imagecolorallocate($photo, 255, 255, 255));
        imagecopyresampled($photo, $source, 0, 0, (int) ((imagesx($source) - $size) / 2), (int) ((imagesy($source) - $size) / 2), 320, 320, $size, $size);
        ob_start();
        imagejpeg($photo, null, 82);
        $encoded = ob_get_clean();
        imagedestroy($source);
        imagedestroy($photo);
        $user = $request->user();
        $user->update(['photo_url' => 'data:image/jpeg;base64,'.base64_encode($encoded)]);

        return response()->json(['message' => 'Profile photo updated.', 'user' => $user]);
    }

    public function deletePhoto(Request $request)
    {
        $user = $request->user();
        $user->update(['photo_url' => null]);

        return response()->json(['message' => 'Profile photo removed.', 'user' => $user]);
    }

    public function pending()
    {
        return response()->json(VolunteerProfile::with('user:id,name,email')->where('review_status', 'Pending')->oldest('updated_at')->get());
    }

    public function review(Request $request, VolunteerProfile $profile)
    {
        $validated = $request->validate(['review_status' => 'required|in:Approved,Rejected', 'findings_type' => 'sometimes|in:none,comments', 'review_notes' => 'nullable|string|max:1000', 'reviewed_version' => 'required|date']);

        return DB::transaction(function () use ($request, $profile, $validated) {
            $profile->user()->lockForUpdate()->firstOrFail();
            $profile->refresh();
            abort_unless($profile->review_status === 'Pending' && $profile->updated_at->equalTo($validated['reviewed_version']), 409, 'Profile changed or was already reviewed. Reload before deciding.');
            abort_if($validated['review_status'] === 'Approved' && (! $profile->birth_date || ! $profile->phone || ! $profile->address || ! $profile->emergency_name || ! $profile->emergency_phone), 422, 'Complete personal details and emergency caretaker are required for screening.');
            $profile->update(['review_status' => $validated['review_status'], 'review_notes' => ($validated['findings_type'] ?? null) === 'none' ? null : ($validated['review_notes'] ?? null), 'reviewed_by' => $request->user()->id]);
            UserNotification::send($profile->user_id, 'Your home profile screening was '.strtolower($profile->review_status).'. '.$profile->review_notes, '/profile');

            return response()->json(['message' => 'Profile screening saved.']);
        });
    }
}
