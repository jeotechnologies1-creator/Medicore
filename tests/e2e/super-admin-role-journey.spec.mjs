import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'super_admin',
  allowed: ["dashboard","patients","records","appointments","laboratory","radiology","pharmacy","billing","surgeries","inventory","hr","audit","settings"],
  denied: []
});
