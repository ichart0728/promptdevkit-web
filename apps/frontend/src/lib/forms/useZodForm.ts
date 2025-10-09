import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormProps } from 'react-hook-form';
import type { z } from 'zod';

export const useZodForm = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  props?: Omit<UseFormProps<z.infer<TSchema>>, 'resolver'>,
) => {
  return useForm<z.infer<TSchema>>({
    resolver: zodResolver(schema),
    ...props,
  });
};

export { zodResolver } from '@hookform/resolvers/zod';
