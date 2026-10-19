<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('shelter_name', 150)->nullable();
            $table->string('shelter_address', 500)->nullable();
            $table->string('shelter_key', 64)->nullable()->index();
            $table->string('shelter_id_path')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('staff_reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('staff_reviewed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('staff_reviewed_by');
            $table->dropColumn(['shelter_name', 'shelter_address', 'shelter_key', 'shelter_id_path', 'rejection_reason', 'staff_reviewed_at']);
        });
    }
};
