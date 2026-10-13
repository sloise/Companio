<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Remember which staff member approved / rejected a request, and when.
    // Status can now also be "Withdrawn" (cancelled by the volunteer).
    public function up(): void
    {
        Schema::table('foster_applications', function (Blueprint $table) {
            $table->foreignId('decided_by')->nullable()->after('staff_notes')->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable()->after('decided_by');
        });
    }

    public function down(): void
    {
        Schema::table('foster_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('decided_by');
            $table->dropColumn('decided_at');
        });
    }
};
