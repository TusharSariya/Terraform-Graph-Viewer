import React from 'react';
import useGraphInteraction from './hooks/useGraphInteraction';


const SaveGraph = ({shapes, paths, drawLines}) => {

    return (<div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'flex',
        flexDirection: 'column', 
        alignItems: 'center',
        gap: '10px',
        zIndex: 100
    }}>
        <div style={{
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
            }}>
                <button onClick= {() =>console.log("clicked button")}
                style={{
                    background: '#1a73e8',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    pointerEvents: 'auto'
                  }}  
                >
                    Save 
                </button>
        </div>
        <div style={{
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
            }}>
                <button onClick= {() =>console.log("clicked button")}
                style={{
                    background: '#1a73e8',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '14px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    pointerEvents: 'auto'
                  }}  
                >
                    Load 
                </button>
        </div>
    </div>
    );
};

export default SaveGraph;