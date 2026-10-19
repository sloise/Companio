<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', function (Blueprint $table) {
            $table->date('birth_date')->nullable();
            $table->string('health_status')->default('Records Unavailable');
            $table->json('vaccinations')->nullable();
            $table->string('sterilization_status')->default('Unknown/No Records');
        });
        Schema::table('users', function (Blueprint $table) {
            $table->string('archived_email', 150)->nullable();
            $table->timestamp('archived_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('animals', fn (Blueprint $table) => $table->dropColumn(['birth_date', 'health_status', 'vaccinations', 'sterilization_status']));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['archived_email', 'archived_at']));
    }
};
