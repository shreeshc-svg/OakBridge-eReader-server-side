import { categories_repository } from './categories.repository';

export const categories_service = {
     async create_category(data: { category_name: string; parent_id?: string | null }) {
          const { category_name, parent_id = null } = data;

          //   check whether the category is already exist or not
          const existing_category =
               await categories_repository.get_category_by_name(category_name);

          if (existing_category) {
               throw new Error(`Category ${category_name} already exists`);
          }

          // Validate parent category
          if (parent_id) {
               const parent = await categories_repository.get_category_by_id(parent_id);
               if (!parent) {
                    throw new Error('Parent category does not exist');
               }
               if (parent.parent_id) {
                    throw new Error('Parent category cannot be a subcategory itself');
               }
          }

          // generate slug
          const slug = category_name
               .toLowerCase()
               .trim()
               .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric characters with hyphens
               .replace(/(^-|-$)+/g, ''); //Remove leading/trailing hyphens

          const created_category = await categories_repository.create_category({
               id: crypto.randomUUID(),
               category_name,
               slug,
               parent_id,
          });

          return created_category;
     },

     async get_all_categories() {
          const all_categories =
               await categories_repository.get_all_categories();

          return all_categories;
     },

     async update_category(id: string, data: { category_name: string; parent_id?: string | null }) {
          const { category_name, parent_id = null } = data;

          // check whether the category exists
          const existing_category =
               await categories_repository.get_category_by_id(id);

          if (!existing_category) {
               throw new Error(`Category not found`);
          }

          // Check if another category with the new name already exists
          const category_with_same_name =
               await categories_repository.get_category_by_name(category_name);

          if (category_with_same_name && category_with_same_name.id !== id) {
               throw new Error(`Category ${category_name} already exists`);
          }

          // Validate parent_id
          if (parent_id) {
               if (parent_id === id) {
                    throw new Error('A category cannot be its own parent');
               }
               const parent = await categories_repository.get_category_by_id(parent_id);
               if (!parent) {
                    throw new Error('Parent category does not exist');
               }
               if (parent.parent_id) {
                    throw new Error('Parent category cannot be a subcategory itself');
               }
          }

          // generate new slug
          const slug = category_name
               .toLowerCase()
               .trim()
               .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric characters with hyphens
               .replace(/(^-|-$)+/g, ''); // Remove leading/trailing hyphens

          const updated_category = await categories_repository.update_category(
               id,
               category_name,
               slug,
               parent_id
          );
          return updated_category;
     },

     async delete_category(id: string) {
          // check whether the category exists
          const existing_category =
               await categories_repository.get_category_by_id(id);

          if (!existing_category) {
               throw new Error('Category not found');
          }

          const deleted_category =
               await categories_repository.delete_category(id);

          return deleted_category;
     },
};
