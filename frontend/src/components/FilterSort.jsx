import React from 'react';
import './FilterSort.css';

const FilterSort = ({ 
  categories, 
  selectedCategory, 
  onCategoryChange, 
  sortOrder, 
  onSortChange 
}) => {
  return (
    <div className="filter-sort">
      <div className="filter-group">
        <label htmlFor="category-filter">Category:</label>
        <select
          id="category-filter"
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="filter-select"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      
      <div className="sort-group">
        <label htmlFor="sort-order">Sort by:</label>
        <select id="sort-order"
value={sortOrder}
onChange={(e) => onSortChange(e.target.value)}
className="sort-select"
>
<option value="newest">Newest First</option>
<option value="oldest">Oldest First</option>
</select>
</div>
</div>
);
};
export default FilterSort;