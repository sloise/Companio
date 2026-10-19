<?php

namespace App\Http\Controllers;

class PrivacyNoticeController extends Controller
{
    public function show()
    {
        return response()->json(array_merge(config('privacy'), ['ready' => self::ready()]));
    }

    public static function ready(): bool
    {
        return filled(config('privacy.controller')) && filled(config('privacy.contact')) && filled(config('privacy.retention'));
    }
}
