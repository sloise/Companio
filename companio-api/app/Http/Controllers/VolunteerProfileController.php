<?php

namespace App\Http\Controllers;

use App\Models\VolunteerProfile;
use Illuminate\Http\Request;

class VolunteerProfileController extends Controller
{
    // READ - returns the profile, or null if the questionnaire was never answered
    public function show(Request $request)
    {
        $profile = $request->user()->volunteerProfile;

        // response()->json(null) would send "{}", which the browser treats as a real profile,
        // so a missing profile is sent as a literal JSON null instead
        if (! $profile) {
            return response('null', 200, ['Content-Type' => 'application/json']);
        }

        return response()->json($profile);
    }

    // CREATE / UPDATE - the questionnaire
    public function update(Request $request)
    {
        $validated = $request->validate([
            'housing_type' => 'required|in:apartment,house,townhouse,dormitory',
            'yard' => 'required|in:none,small,fenced',
            'has_cats' => 'required|boolean',
            'has_dogs' => 'required|boolean',
            'kids' => 'required|in:none,older,young',
            'hours_alone' => 'required|in:4,8,12',
            'experience' => 'required|in:first_time,some,experienced',
        ]);

        $profile = VolunteerProfile::updateOrCreate(
            ['user_id' => $request->user()->id],
            $validated
        );

        return response()->json([
            'message' => 'Home profile saved.',
            'profile' => $profile,
        ]);
    }
}
