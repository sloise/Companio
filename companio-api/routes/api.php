<?php

use App\Http\Controllers\AnimalController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FosterApplicationController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\PlacementController;
use App\Http\Controllers\StaffRequestController;
use App\Http\Controllers\VolunteerProfileController;
use App\Http\Middleware\EnsureAdmin;
use Illuminate\Support\Facades\Route;

// ---------- Public ----------
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

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

    // Shelter admin only
    Route::middleware(EnsureAdmin::class)->prefix('admin')->group(function () {
        Route::get('/dashboard', [DashboardController::class, 'stats']);
        Route::apiResource('animals', AnimalController::class);
        Route::get('/applications', [FosterApplicationController::class, 'index']);
        Route::patch('/applications/{application}', [FosterApplicationController::class, 'decide']);
        Route::get('/placements', [PlacementController::class, 'index']);
        Route::patch('/placements/{placement}', [PlacementController::class, 'update']);
        Route::get('/staff-requests', [StaffRequestController::class, 'index']);
        Route::patch('/staff-requests/{user}', [StaffRequestController::class, 'approve']);
        Route::delete('/staff-requests/{user}', [StaffRequestController::class, 'decline']);
    });
});
