import { roleJourney } from './role-journey-helper.mjs';

roleJourney({
  role: 'surgeon',
  allowed: ["dashboard","patients","clinical_workflows","surgeries","clinical_safety"],
  denied: ["billing","pharmacy","hr"]
});
