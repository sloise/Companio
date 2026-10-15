<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // The foster can tell the shelter how they'd like the placement to end.
    // The shelter still confirms it with the Adopted / Returned buttons.
    public function up(): void
    {
        Schema::table('placements', function (Blueprint $table) {
            $table->string('foster_request')->nullable()->after('status');      // adopt | return
            $table->text('foster_request_note')->nullable()->after('foster_request');
            $table->timestamp('foster_requested_at')->nullable()->after('foster_request_note');
        });
    }

    public function down(): void
    {
        Schema::table('placements', function (Blueprint $table) {
            $table->dropColumn(['foster_request', 'foster_request_note', 'foster_requested_at']);
        });
    }
};
