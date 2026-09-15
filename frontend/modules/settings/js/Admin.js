/**
 * Admin.js - Backwards Compatibility Export
 * Re-exports the modularized WorkerAccessComponent as AdminComponent
 */
import { WorkerAccessComponent } from './workers/WorkerAccessComponent.js';

export { WorkerAccessComponent as AdminComponent, WorkerAccessComponent };
export default WorkerAccessComponent;
