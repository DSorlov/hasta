export {}; // disable implicit exporting of types

type Unpromise<T> = T extends Promise<infer U> ? U : T;
