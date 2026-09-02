import path from 'node:path';

const RELATIVE_KERNEL_PREFIX = 'file:vendor/kernel/';

export function absolutizeKernelFileReferences(source, kernelCache) {
  const absoluteKernel = path.resolve(kernelCache).replaceAll('\\', '/').replace(/\/$/, '');
  return source.replaceAll(RELATIVE_KERNEL_PREFIX, `file:${absoluteKernel}/`);
}
