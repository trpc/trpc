import { ErrorMessage, Field, useField } from "formik";
import { LeafPath, Path, PathValue } from "./types";

type FieldProps = React.ComponentProps<typeof Field>;
type TypedFieldProps<TValues, TPath extends LeafPath<TValues>> = Omit<
  FieldProps,
  "name"
> & {
  name: TPath;
};

type ErrorMessageProps = React.ComponentProps<typeof ErrorMessage>;
type TypedErrorMessageProps<TValues, TPath extends LeafPath<TValues>> = Omit<
  ErrorMessageProps,
  "name"
> & {
  name: TPath;
};

type UseFieldProps = Parameters<typeof useField>[0];
type TypedUseField<TValues, TPath extends LeafPath<TValues>> = Omit<
  UseFieldProps,
  "name"
> & {
  name: TPath;
};

export function typedFormik<TValues>({}: { initialValues: TValues }) {
  return {
    Field: function TypedField<TPath extends LeafPath<TValues>>(
      props: TypedFieldProps<TValues, TPath>,
    ) {
      return <Field {...props} />;
    },
    ErrorMessage: function TypedErrorMessage<TPath extends LeafPath<TValues>>(
      props: TypedErrorMessageProps<TValues, TPath>,
    ) {
      return <Field {...props} />;
    },
    useField: function useTypedField<TPath extends LeafPath<TValues> & string>(
      props: TypedUseField<TValues, TPath>,
    ) {
      const [field, meta, helpers] = useField(props);

      return [
        {
          ...field,
          value: field.value as PathValue<TValues, TPath>,
        },
        meta,
        helpers,
      ] as const;
    },
  };
}
