// ตรงกับ node-red/data/prompts/medicine-parse.schema.json — แก้ที่หนึ่ง ต้องแก้อีกที่ด้วย

export type Slot = 'morning' | 'noon' | 'evening' | 'bedtime';
export type MealRelation = 'before' | 'after' | 'with' | 'any' | 'unknown';
export type DoseUnit =
  | 'tablet' | 'capsule' | 'ml' | 'teaspoon' | 'tablespoon'
  | 'sachet' | 'drop' | 'puff' | 'other';

export interface FieldConfidence {
  name: number;
  dose: number;
  slots: number;
  meal_relation: number;
}

export interface ParsedMedication {
  name: string;
  strength: string | null;
  dose_per_time: number | null;
  unit: DoseUnit;
  slots: Slot[];
  meal_relation: MealRelation;
  as_needed: boolean;
  total_qty: number | null;
  indication: string | null;
  warnings: string[];
  source_text: string;
  confidence: FieldConfidence;
}

export interface MedicineParseResult {
  /** ข้อความที่ Gemini ถอดจากรูป (ปิดชื่อผู้ป่วย/HN/เลขบัตร/เบอร์โทรแล้ว) */
  ocr_text: string;
  is_medicine_label: boolean;
  medications: ParsedMedication[];
  unreadable_parts: string[];
  overall_note: string | null;
}

export interface ReviewFlag {
  index: number;          // ลำดับยาใน medications (-1 = ทั้งผลลัพธ์)
  field: string;
  reason: string;
}

export interface ScanResponse {
  prescription_id: number;
  ocr_text: string;
  result: MedicineParseResult;
  review_flags: ReviewFlag[];
}
