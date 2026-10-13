<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Urgent animals can have a "needs a home by" deadline
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->date('needed_by')->nullable()->after('is_urgent');
        });
    }

    public function down(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->dropColumn('needed_by');
        });
    }
};
