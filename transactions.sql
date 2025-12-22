CREATE TABLE transactions (
    txId VARCHAR(255) PRIMARY KEY,       -- Unique transaction identifier
    sender VARCHAR(255) NOT NULL,        -- Sender name or ID
    receiver VARCHAR(255) NOT NULL,      -- Receiver name or ID
    account VARCHAR(4) NOT NULL,         -- Storing the 'last4' digits
    amt DECIMAL(19, 4) NOT NULL,         -- Precise financial amount
    tx_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Full date/time
    
    -- Indexing common search fields for performance
    INDEX idx_sender (sender),
    INDEX idx_receiver (receiver)
);