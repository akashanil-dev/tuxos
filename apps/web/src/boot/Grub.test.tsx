import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import { Grub } from './Grub';
afterEach(cleanup);
it('exposes touch/keyboard activation and records memory/recovery choices with explicit simulation wording',()=>{
  const onBoot=vi.fn(),onMemoryTest=vi.fn();render(<Grub onBoot={onBoot} onMemoryTest={onMemoryTest}/>);
  fireEvent.click(screen.getByRole('option',{name:/Memory test/}));fireEvent.click(screen.getByRole('button',{name:'Run selected entry'}));
  expect(onMemoryTest).toHaveBeenCalledTimes(1);expect(screen.getByRole('status').textContent).toContain('does not test your real computer');
  fireEvent.click(screen.getByRole('option',{name:/Advanced options/}));fireEvent.click(screen.getByRole('button',{name:'Run selected entry'}));
  fireEvent.click(screen.getByRole('option',{name:/recovery mode/}));fireEvent.keyDown(window,{key:'Enter'});
  expect(onBoot).toHaveBeenCalledWith('recovery');
});
