import {bootstrapApplication} from '@angular/platform-browser';
import {Designer} from './designer';
import {designerConfig} from './designer.config';

bootstrapApplication(Designer, designerConfig).catch(err => console.error(err));
