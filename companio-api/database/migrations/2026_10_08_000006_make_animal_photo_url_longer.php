<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// photo_url can now hold an uploaded image (saved as a base64 "data:image/..." string),
// so it needs more room than a 500-character link
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->mediumText('photo_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->string('photo_url', 500)->nullable()->change();
        });
    }
};
