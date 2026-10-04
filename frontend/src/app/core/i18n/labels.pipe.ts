import { Pipe, PipeTransform } from '@angular/core';
import { DoseUnit, MealRelation, Slot } from '../api/medicine-parse.model';
import { doseText, MEAL_LABEL, SLOT_LABEL, UNIT_LABEL, unitInDose } from './labels';

@Pipe({ name: 'slotLabel' })
export class SlotLabelPipe implements PipeTransform {
  transform(v: Slot): string { return SLOT_LABEL[v] ?? v; }
}

@Pipe({ name: 'mealLabel' })
export class MealLabelPipe implements PipeTransform {
  transform(v: MealRelation): string { return MEAL_LABEL[v] ?? ''; }
}

@Pipe({ name: 'unitLabel' })
export class UnitLabelPipe implements PipeTransform {
  transform(v: DoseUnit): string { return UNIT_LABEL[v] ?? v; }
}

/** doseQty: 0.5 → '½' ; doseQty:'tablet' → '½ เม็ด' */
@Pipe({ name: 'doseQty' })
export class DoseQtyPipe implements PipeTransform {
  transform(v: number, unit?: DoseUnit): string {
    return unit ? `${doseText(v)} ${unitInDose(unit)}` : doseText(v);
  }
}
