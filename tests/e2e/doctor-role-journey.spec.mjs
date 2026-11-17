import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'doctor',
  allowed: ["dashboard","patients","appointments","consultations","laboratory","radiology","prescriptions"],
  denied: ["billing","hr","procurement"]
});
