import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationResolver } from './location-resolver';

test('LocationResolver prefers closer candidate when text match is similar', () => {
  const resolver = new LocationResolver();
  const raw = {
    name: 'Central Parking',
    address: '',
    houseNumber: '',
    district: '',
    amphoe: '',
    subdistrict: '',
    province: '',
    latitude: 13.746,
    longitude: 100.535,
  };

  const far = {
    id: 'far',
    resourceName: 'places/far',
    displayName: 'Central Parking',
    formattedAddress: 'Central Parking, Thailand',
    location: { latitude: 13.9, longitude: 100.7 },
    addressComponents: [],
  };
  const near = {
    id: 'near',
    resourceName: 'places/near',
    displayName: 'Central Parking',
    formattedAddress: 'Central Parking, Thailand',
    location: { latitude: 13.7462, longitude: 100.5351 },
    addressComponents: [],
  };

  const selection = resolver.chooseBestCandidate([far, near], raw);

  assert.ok(selection);
  assert.equal(selection?.candidate.id, 'near');
  assert.ok((selection?.confidence || 0) >= 0.45);
});
