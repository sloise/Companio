<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('volunteer_profiles', function (Blueprint $table) {
            foreach (['phone', 'address', 'emergency_name', 'emergency_phone'] as $field) {
                $table->string($field)->nullable();
            }
            $table->date('birth_date')->nullable();
            $table->string('review_status')->default('Pending');
            $table->text('review_notes')->nullable();
            $table->timestamp('last_edited_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
        });
        Schema::table('animals', function (Blueprint $table) {
            $table->string('urgent_reason', 500)->nullable();
        });
        Schema::table('foster_applications', function (Blueprint $table) {
            $table->json('screening')->nullable();
            $table->json('documents')->nullable();
            $table->json('profile_snapshot')->nullable();
            $table->timestamp('verification_completed_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('foster_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn(['screening', 'documents', 'profile_snapshot', 'verification_completed_at']);
        });
        Schema::table('animals', fn (Blueprint $table) => $table->dropColumn('urgent_reason'));
        Schema::table('volunteer_profiles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['phone', 'address', 'emergency_name', 'emergency_phone', 'birth_date', 'review_status', 'review_notes', 'last_edited_at']);
        });
    }
};
