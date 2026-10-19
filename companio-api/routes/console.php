<?php

use App\Models\User;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Run only from the trusted server console; public registration cannot grant this role.
Artisan::command('companio:super-admin {email}', function () {
    $user = User::where('email', mb_strtolower(trim($this->argument('email'))))->first();
    if (! $user || ! in_array($user->role, ['admin', 'super_admin'], true)) {
        $this->error('Choose an existing approved admin account.');

        return 1;
    }
    $user->forceFill(['role' => 'super_admin'])->save();
    $user->tokens()->delete();
    $this->info('Super Admin designated. Sign in again.');
})->purpose('Designate an existing approved admin as Super Admin');
