import React from 'react';

const PageHeader = ({ title, subtitle, actions }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-gray-500 text-sm md:text-[15px] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-3 items-center shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
