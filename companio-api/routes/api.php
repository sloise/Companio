<?php

use App\Http\Controllers\AnimalController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FavoriteController;
use App\Http\Controllers\FosterApplicationController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PlacementController;
use App\Http\Controllers\StaffRequestController;
use App\Http\Controllers\VolunteerProfileController;
use App\Http\Middleware\EnsureAdmin;
use Illuminate\Support\Facades\Route;

// ---------- Public ----------
// throttle:10,1 = at most 10 tries per minute from one address (stops password guessing)
Route::middleware('throttle:10,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
});

// ---------- Logged-in users ----------
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Foster volunteer
    Route::get('/profile', [VolunteerProfileController::class, 'show']);
    Route::put('/profile', [VolunteerProfileController::class, 'update']);
    Route::get('/matches', [MatchController::class, 'index']);
    Route::get('/matches/{animal}', [MatchController::class, 'show']);
    Route::post('/applications', [FosterApplicationController::class, 'store']);
    Route::get('/my-applications', [FosterApplicationController::class, 'mine']);
    Route::patch('/my-applications/{application}/withdraw', [FosterApplicationController::class, 'withdraw']);
    Route::get('/favorites', [FavoriteController::class, 'index']);
    Route::post('/favorites/{animal}', [FavoriteController::class, 'store']);
    Route::delete('/favorites/{animal}', [FavoriteController::class, 'destroy']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read', [NotificationController::class, 'readAll']);

    // Shelter admin only
    Route::middleware(EnsureAdmin::class)->prefix('admin')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'stats']);
        Route::get('/counts', [DashboardController::class, 'counts']);
        Route::apiResource('animals', AnimalController::class);
        Route::get('/animals/{animal}/history', [AnimalController::class, 'history']);
        Route::get('/applications', [FosterApplicationController::class, 'index']);
        Route::patch('/applications/{application}', [FosterApplicationController::class, 'decide']);
        Route::patch('/applications/{application}/reopen', [FosterApplicationController::class, 'reopen']);
        Route::get('/placements', [PlacementController::class, 'index']);
        Route::patch('/placements/{placement}', [PlacementController::class, 'update']);
        Route::get('/staff-requests', [StaffRequestController::class, 'index']);
        Route::patch('/staff-requests/{user}', [StaffRequestController::class, 'approve']);
        Route::delete('/staff-requests/{user}', [StaffRequestController::class, 'decline']);
    });
});
