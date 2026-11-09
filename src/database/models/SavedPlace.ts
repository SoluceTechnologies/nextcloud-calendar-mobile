// @ts-nocheck

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class SavedPlace extends Model {
  static table = 'saved_places';

  @field('label') label: string;
  @field('address') address?: string;
  @field('lat') lat: number;
  @field('lon') lon: number;
  @field('created_at') createdAt: number;
}
