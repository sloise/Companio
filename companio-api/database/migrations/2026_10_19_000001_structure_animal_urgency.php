<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('animals', fn (Blueprint $table) => $table->text('urgent_notes')->nullable());
        DB::table('animals')->where('is_urgent', true)->whereNull('needed_by')->update(['needed_by' => today()->addDays(14)->toDateString()]);
        DB::table('animals')->whereNotNull('urgent_reason')->whereNotIn('urgent_reason', ['Medical care', 'Shelter capacity', 'Transport deadline'])->update(['urgent_notes' => DB::raw('urgent_reason'), 'urgent_reason' => null]);
        DB::table('animals')->where('status', 'In Foster Care')->orWhere('is_urgent', false)->update(['is_urgent' => false, 'needed_by' => null, 'urgent_reason' => null, 'urgent_notes' => null]);
    }

    public function down(): void
    {
        Schema::table('animals', fn (Blueprint $table) => $table->dropColumn('urgent_notes'));
    }
};
